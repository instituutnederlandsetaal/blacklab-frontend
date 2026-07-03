package nl.inl.corpuswebsite.utils;

import jakarta.servlet.http.HttpServletResponse;

public class HttpException extends RuntimeException {
	private final int code;

	public static HttpException wrap(Exception cause) {
		if (cause instanceof HttpException) return (HttpException) cause;
		return new HttpException(cause, HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
	}

	public static HttpException wrap(Exception cause, String message) {
		if (cause instanceof HttpException) {
			HttpException other = (HttpException) cause;
			return new HttpException(other.getCause(), other.getHttpStatusCode(), message + ": " + other.getMessage());
		}
		return new HttpException(cause, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, message);
	}

	public static HttpException wrap(Exception cause, String message, int code) {
		if (cause instanceof HttpException) {
			HttpException other = (HttpException) cause;
			return new HttpException(other.getCause(), code, message + ": " + other.getMessage());
		}
		return new HttpException(cause, code, message);
	}

	public HttpException(int code, String message) {
		super(message);
		this.code = code;
	}
	
	protected HttpException(Throwable e, int code, String message) {
		super(message, e);
		assert !(e instanceof HttpException);
		this.code = code;
	}

	protected HttpException(Throwable e, int code) {
		super(e);
		assert !(e instanceof HttpException);
		this.code = code;
	}
	
	public int getHttpStatusCode() {
		return code;
	}
}
